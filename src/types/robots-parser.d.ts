declare module 'robots-parser' {
  interface Robots {
    isAllowed(url: string, userAgent?: string): boolean | undefined;
    isDisallowed(url: string, userAgent?: string): boolean | undefined;
    getSitemaps(): string[];
  }
  export default function robotsParser(url: string, contents: string): Robots;
}
