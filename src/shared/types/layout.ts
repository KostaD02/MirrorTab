export interface ViewportSize {
  width: number;
  height: number;
}

// ? the usable area of the screen the popup is on, which only a page can read
export interface ScreenArea {
  left: number;
  top: number;
  width: number;
  height: number;
}
