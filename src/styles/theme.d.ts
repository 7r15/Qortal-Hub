import '@mui/material/styles';

declare module '@mui/material/styles' {
  interface TypeBackground {
    surface: string;
    elevated: string;
  }
  interface Palette {
    chessBoard?: {
      light: string;
      dark: string;
    };
    border: {
      main: string;
      subtle: string;
    };
    other: {
      positive: string;
      danger: string;
      unread: string;
    };
  }
  interface PaletteOptions {
    chessBoard?: {
      light: string;
      dark: string;
    };
    border?: {
      main?: string;
      subtle?: string;
    };
    other?: {
      positive?: string;
      danger?: string;
      unread?: string;
    };
  }
}
