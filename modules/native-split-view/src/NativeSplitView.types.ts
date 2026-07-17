import type { ReactNode } from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export type DividerStyle = 'thin' | 'thick' | 'paneSplitter';
export type SplitOrientation = 'horizontal' | 'vertical';

export type DividerPositionsChangeEvent = NativeSyntheticEvent<{
  positions: number[];
}>;

export type NativeSplitViewProps = ViewProps & {
  children: ReactNode;
  orientation?: SplitOrientation;
  dividerStyle?: DividerStyle;
  onDividerPositionsChange?: (event: DividerPositionsChangeEvent) => void;
};

export type NativeSplitViewRef = {
  setDividerPosition(position: number, dividerIndex: number): Promise<void>;
};
