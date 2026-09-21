import { SubtitleItem } from '../domain/timeline.js';

export class SubtitleGenerator {
  /**
   * Formats seconds into SRT timestamp: HH:MM:SS,mmm
   */
  public static formatSrtTimestamp(seconds: number): string {
    const totalMs = Math.max(0, Math.floor(seconds * 1000));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const millis = totalMs % 1000;

    const pad = (n: number, z = 2) => String(n).padStart(z, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`;
  }

  /**
   * Formats seconds into WebVTT timestamp: HH:MM:SS.mmm
   */
  public static formatVttTimestamp(seconds: number): string {
    const totalMs = Math.max(0, Math.floor(seconds * 1000));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const millis = totalMs % 1000;

    const pad = (n: number, z = 2) => String(n).padStart(z, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(millis, 3)}`;
  }

  /**
   * Generates a standard SubRip (.srt) subtitle string.
   */
  public static generateSrt(subtitles: SubtitleItem[]): string {
    const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
    const blocks: string[] = [];

    sorted.forEach((sub, index) => {
      const idx = index + 1;
      const start = this.formatSrtTimestamp(sub.startTime);
      const end = this.formatSrtTimestamp(sub.endTime);
      const speakerPrefix = sub.speaker ? `${sub.speaker.toUpperCase()}: ` : '';
      const text = `${speakerPrefix}${sub.text.trim()}`;

      blocks.push(`${idx}\n${start} --> ${end}\n${text}`);
    });

    return blocks.join('\n\n') + (blocks.length > 0 ? '\n' : '');
  }

  /**
   * Generates a standard WebVTT (.vtt) subtitle string.
   */
  public static generateVtt(subtitles: SubtitleItem[]): string {
    const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
    const blocks: string[] = ['WEBVTT', ''];

    sorted.forEach((sub, index) => {
      const start = this.formatVttTimestamp(sub.startTime);
      const end = this.formatVttTimestamp(sub.endTime);
      const speakerPrefix = sub.speaker ? `<v ${sub.speaker}>` : '';
      const speakerSuffix = sub.speaker ? '</v>' : '';
      const text = `${speakerPrefix}${sub.text.trim()}${speakerSuffix}`;

      blocks.push(`${index + 1}\n${start} --> ${end}\n${text}\n`);
    });

    return blocks.join('\n');
  }

  /**
   * Parses an SRT subtitle string into SubtitleItem[].
   */
  public static parseSrt(srtContent: string): SubtitleItem[] {
    const items: SubtitleItem[] = [];
    const blocks = srtContent.trim().split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.split('\n').map((l) => l.trim());
      if (lines.length < 3) continue;

      const timeLine = lines[1];
      const match = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
      if (!match) continue;

      const parseTime = (tStr: string): number => {
        const [hms, ms] = tStr.split(',');
        const [h, m, s] = hms.split(':').map(Number);
        return h * 3600 + m * 60 + s + Number(ms) / 1000;
      };

      const startTime = parseTime(match[1]);
      const endTime = parseTime(match[2]);
      const textLines = lines.slice(2).join(' ');

      let speaker: string | undefined;
      let text = textLines;
      const speakerMatch = textLines.match(/^([^:]+):\s*(.+)$/);
      if (speakerMatch) {
        speaker = speakerMatch[1].trim();
        text = speakerMatch[2].trim();
      }

      items.push({
        id: `sub_${items.length + 1}`,
        startTime,
        endTime,
        speaker,
        text,
      });
    }

    return items;
  }
}
