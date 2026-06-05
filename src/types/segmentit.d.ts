declare module 'segmentit' {
  interface SegmentResult {
    w: string;
    p: number;
  }
  export class Segment {
    doSegment(text: string): SegmentResult[];
  }
  export function useDefault(segment: Segment): void;
}
