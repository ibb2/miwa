import 'react-native';

declare module 'react-native/Libraries/Components/View/ViewPropTypes' {
  interface ViewProps {
    tooltip?: string;
  }
}
