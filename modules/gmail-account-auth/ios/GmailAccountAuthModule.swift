import AppKit
import ExpoModulesCore
import GoogleSignIn
import Security

private let gmailModifyScope = "https://www.googleapis.com/auth/gmail.modify"

private struct StoredAccount: Codable {
  let id: String
  let provider: String
  let email: String
  let displayName: String
  let avatarUrl: String?
  let order: Int

  var payload: [String: Any?] {
    [
      "id": id,
      "provider": provider,
      "email": email,
      "displayName": displayName,
      "avatarUrl": avatarUrl,
      "order": order,
    ]
  }
}

private enum GmailAuthError: LocalizedError {
  case missingConfiguration
  case missingWindow
  case missingIdentity
  case missingCredential
  case wrongAccount
  case unsignedApplication

  var errorDescription: String? {
    switch self {
    case .missingConfiguration:
      return "Google Sign-In is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REVERSED_CLIENT_ID for the macOS target."
    case .missingWindow:
      return "Miwa could not find a window for Google Sign-In."
    case .missingIdentity:
      return "Google did not return an account identity."
    case .missingCredential:
      return "This Gmail account needs to be connected again."
    case .wrongAccount:
      return "Choose the same Google account to finish reconnecting."
    case .unsignedApplication:
      return "Google Sign-In requires an Apple-signed macOS build so credentials can be stored in Keychain. Select a Development Team for the Miwa-macOS target in Xcode, then rebuild the app."
    }
  }
}

private final class GmailCredentialStore {
  private let accountIndexKey = "Miwa.GmailAccountAuth.accounts.v1"
  private let legacyCredentialService = "com.ib.miwa.gmail-account"

  func accounts() -> [StoredAccount] {
    removeLegacyCredentials()
    guard let data = UserDefaults.standard.data(forKey: accountIndexKey),
          let decoded = try? JSONDecoder().decode([StoredAccount].self, from: data) else {
      return []
    }
    return decoded.sorted { $0.order < $1.order }
  }

  func saveMetadata(user: GIDGoogleUser) throws -> StoredAccount {
    guard let id = user.userID, let profile = user.profile else {
      throw GmailAuthError.missingIdentity
    }
    var current = accounts()
    let existing = current.first { $0.id == id }
    let account = StoredAccount(
      id: id,
      provider: "gmail",
      email: profile.email,
      displayName: profile.name,
      avatarUrl: profile.hasImage ? profile.imageURL(withDimension: 96)?.absoluteString : nil,
      order: existing?.order ?? ((current.map(\.order).max() ?? -1) + 1)
    )
    current.removeAll { $0.id == id }
    current.append(account)
    saveAccounts(current.sorted { $0.order < $1.order })
    return account
  }

  func removeMetadata(accountId: String) {
    saveAccounts(accounts().filter { $0.id != accountId })
  }

  private func saveAccounts(_ accounts: [StoredAccount]) {
    if let data = try? JSONEncoder().encode(accounts) {
      UserDefaults.standard.set(data, forKey: accountIndexKey)
    }
  }

  private func removeLegacyCredentials() {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: legacyCredentialService,
    ]
    SecItemDelete(query as CFDictionary)
  }
}

public final class GmailAccountAuthModule: Module {
  private let store = GmailCredentialStore()

  public func definition() -> ModuleDefinition {
    Name("GmailAccountAuth")

    AsyncFunction("listAccounts") { () -> [[String: Any?]] in
      self.store.accounts().map(\.payload)
    }

    AsyncFunction("connectAccount") { () async throws -> [String: Any?] in
      try await self.signIn(expectedAccountId: nil)
    }

    AsyncFunction("reauthorizeAccount") { (accountId: String) async throws -> [String: Any?] in
      try await self.signIn(expectedAccountId: accountId)
    }

    AsyncFunction("getAccessToken") {
      (accountId: String, credential: String, forceRefresh: Bool) async throws -> [String: Any?] in
      let storedUser = try self.user(from: credential)
      guard storedUser.userID == accountId else {
        throw GmailAuthError.wrongAccount
      }
      if forceRefresh {
        return try await self.forceRefreshToken(user: storedUser)
      }
      let user = try await storedUser.refreshTokensIfNeeded()
      return [
        "accessToken": user.accessToken.tokenString,
        "expiresAt": (user.accessToken.expirationDate ?? Date(timeIntervalSinceNow: 3600)).timeIntervalSince1970 * 1000,
        "credential": try self.archive(user: user),
      ]
    }

    AsyncFunction("disconnectAccount") { (accountId: String, credential: String?) async throws in
      defer { self.store.removeMetadata(accountId: accountId) }
      guard let credential, let user = try? self.user(from: credential) else { return }
      guard let url = URL(string: "https://oauth2.googleapis.com/revoke") else { return }
      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
      let token = user.refreshToken.tokenString.addingPercentEncoding(
        withAllowedCharacters: .urlQueryAllowed
      ) ?? user.refreshToken.tokenString
      request.httpBody = "token=\(token)".data(using: .utf8)
      _ = try? await URLSession.shared.data(for: request)
    }

    AsyncFunction("removeAccountMetadata") { (accountId: String) in
      self.store.removeMetadata(accountId: accountId)
    }
  }

  private func forceRefreshToken(user: GIDGoogleUser) async throws -> [String: Any?] {
    guard let url = URL(string: "https://oauth2.googleapis.com/token") else {
      throw GmailAuthError.missingCredential
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    let values = [
      "client_id": user.configuration.clientID,
      "refresh_token": user.refreshToken.tokenString,
      "grant_type": "refresh_token",
    ]
    request.httpBody = values
      .map { key, value in
        let allowed = CharacterSet.urlQueryAllowed.subtracting(CharacterSet(charactersIn: "+&="))
        return "\(key)=\(value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value)"
      }
      .joined(separator: "&")
      .data(using: .utf8)
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200,
          let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let accessToken = payload["access_token"] as? String else {
      throw GmailAuthError.missingCredential
    }
    let expiresIn = payload["expires_in"] as? Double ?? 3600
    return [
      "accessToken": accessToken,
      "expiresAt": Date(timeIntervalSinceNow: expiresIn).timeIntervalSince1970 * 1000,
    ]
  }

  @MainActor
  private func signIn(expectedAccountId: String?) async throws -> [String: Any?] {
    guard let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
          clientID.hasSuffix(".apps.googleusercontent.com") else {
      throw GmailAuthError.missingConfiguration
    }
    guard hasAppleTeamIdentifier(), hasKeychainAccessGroup() else {
      throw GmailAuthError.unsignedApplication
    }
    guard let window = NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first else {
      throw GmailAuthError.missingWindow
    }

    GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
    let hint = expectedAccountId.flatMap { id in
      store.accounts().first { $0.id == id }?.email
    }
    let result = try await GIDSignIn.sharedInstance.signIn(
      withPresenting: window,
      hint: hint,
      additionalScopes: [gmailModifyScope]
    )
    if let expectedAccountId, result.user.userID != expectedAccountId {
      throw GmailAuthError.wrongAccount
    }
    let account = try store.saveMetadata(user: result.user)
    var payload = account.payload
    payload["credential"] = try archive(user: result.user)
    return payload
  }

  private func archive(user: GIDGoogleUser) throws -> String {
    try NSKeyedArchiver
      .archivedData(withRootObject: user, requiringSecureCoding: true)
      .base64EncodedString()
  }

  private func user(from credential: String) throws -> GIDGoogleUser {
    guard let data = Data(base64Encoded: credential),
          let user = try NSKeyedUnarchiver.unarchivedObject(
            ofClass: GIDGoogleUser.self,
            from: data
          ) else {
      throw GmailAuthError.missingCredential
    }
    return user
  }

  private func hasKeychainAccessGroup() -> Bool {
    guard let task = SecTaskCreateFromSelf(nil),
          let value = SecTaskCopyValueForEntitlement(
            task,
            "keychain-access-groups" as CFString,
            nil
          ) as? [String] else {
      return false
    }
    return value.contains { !$0.isEmpty && !$0.contains("$(") }
  }

  private func hasAppleTeamIdentifier() -> Bool {
    var staticCode: SecStaticCode?
    guard let executableURL = Bundle.main.executableURL,
          SecStaticCodeCreateWithPath(executableURL as CFURL, [], &staticCode) == errSecSuccess,
          let staticCode else {
      return false
    }

    var signingInformation: CFDictionary?
    guard SecCodeCopySigningInformation(
      staticCode,
      SecCSFlags(rawValue: kSecCSSigningInformation),
      &signingInformation
    ) == errSecSuccess,
      let values = signingInformation as? [String: Any],
      let teamIdentifier = values[kSecCodeInfoTeamIdentifier as String] as? String else {
      return false
    }
    return !teamIdentifier.isEmpty
  }
}
