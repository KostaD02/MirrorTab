export const DownloadFormatEnum = {
  Json: 'json',
  Text: 'text',
} as const;

export type DownloadFormat =
  (typeof DownloadFormatEnum)[keyof typeof DownloadFormatEnum];
