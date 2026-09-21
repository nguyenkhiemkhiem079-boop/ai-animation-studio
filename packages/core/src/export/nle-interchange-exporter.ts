import { TimelineClip, TimelineSequence, TimelineTransition } from '../domain/timeline.js';

export class NLEInterchangeExporter {
  /**
   * Formats seconds into SMPTE timecode string: HH:MM:SS:FF
   */
  public static formatTimecode(seconds: number, fps: number = 24): string {
    const totalFrames = Math.max(0, Math.floor(seconds * fps));
    const f = totalFrames % fps;
    const s = Math.floor(seconds) % 60;
    const m = Math.floor(seconds / 60) % 60;
    const h = Math.floor(seconds / 3600);

    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
  }

  /**
   * Exports the timeline sequence to OpenTimelineIO (.otio) JSON string.
   */
  public static exportOtio(sequence: TimelineSequence): string {
    const fps = sequence.fps || 24;

    const otioTracks = sequence.tracks.map((track) => {
      const kind = track.trackType === 'video' ? 'Video' : 'Audio';

      const children = track.clips.map((clip) => {
        const startFrames = Math.round(clip.startTime * fps);
        const durationFrames = Math.round(clip.duration * fps);

        return {
          OTIO_SCHEMA: 'Clip.1',
          name: clip.name,
          source_range: {
            OTIO_SCHEMA: 'TimeRange.1',
            start_time: {
              OTIO_SCHEMA: 'RationalTime.1',
              value: Math.round(clip.inPoint * fps),
              rate: fps,
            },
            duration: {
              OTIO_SCHEMA: 'RationalTime.1',
              value: durationFrames,
              rate: fps,
            },
          },
          media_reference: {
            OTIO_SCHEMA: 'ExternalReference.1',
            target_url: clip.sourceAssetId,
          },
          metadata: {
            studio: {
              clipId: clip.clipId,
              trackId: clip.trackId,
              volume: clip.volume,
              opacity: clip.opacity,
            },
          },
        };
      });

      return {
        OTIO_SCHEMA: 'Track.1',
        name: track.name,
        kind,
        children,
        metadata: {
          studio: {
            trackId: track.trackId,
            order: track.order,
            volume: track.volume,
            pan: track.pan,
          },
        },
      };
    });

    const otioTimeline = {
      OTIO_SCHEMA: 'Timeline.1',
      name: sequence.name,
      global_start_time: {
        OTIO_SCHEMA: 'RationalTime.1',
        value: 0,
        rate: fps,
      },
      tracks: {
        OTIO_SCHEMA: 'Stack.1',
        children: otioTracks,
      },
      metadata: {
        studio: {
          sequenceId: sequence.sequenceId,
          projectId: sequence.projectId,
          totalDurationSeconds: sequence.totalDuration,
          resolution: sequence.resolution,
        },
      },
    };

    return JSON.stringify(otioTimeline, null, 2);
  }

  /**
   * Exports the video track and transitions to standard CMX 3600 Edit Decision List (.edl).
   */
  public static exportEdl(sequence: TimelineSequence): string {
    const fps = sequence.fps || 24;
    const videoTrack = sequence.tracks.find((t) => t.trackType === 'video');
    const clips = videoTrack?.clips || [];

    const lines: string[] = [
      `TITLE: ${sequence.name.replace(/[^a-zA-Z0-9_-]/g, '_').toUpperCase()}`,
      'FCM: NON-DROP FRAME',
      '',
    ];

    let currentRecTime = 0;

    clips.forEach((clip, index) => {
      const eventNum = String(index + 1).padStart(3, '0');
      const reel = 'AX';
      const track = 'V';

      // Check transition to this clip from previous
      const prevTransition = sequence.transitions.find((t) => t.toClipId === clip.clipId);
      let transType = 'C';
      let transModifier = '    ';

      if (prevTransition && prevTransition.type === 'cross_dissolve' && prevTransition.duration > 0) {
        transType = 'D';
        const transFrames = Math.round(prevTransition.duration * fps);
        transModifier = String(transFrames).padStart(4, ' ');
      }

      const srcIn = this.formatTimecode(clip.inPoint, fps);
      const srcOut = this.formatTimecode(clip.inPoint + clip.duration, fps);
      const recIn = this.formatTimecode(currentRecTime, fps);
      const recOut = this.formatTimecode(currentRecTime + clip.duration, fps);

      lines.push(`${eventNum}  ${reel}      ${track}     ${transType}${transModifier} ${srcIn} ${srcOut} ${recIn} ${recOut}`);
      lines.push(`* FROM CLIP NAME: ${clip.name}`);
      lines.push('');

      currentRecTime += clip.duration;
    });

    return lines.join('\n');
  }
}
