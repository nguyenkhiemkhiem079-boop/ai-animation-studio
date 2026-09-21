import { z } from 'zod';

export const ExportFormatSchema = z.enum([
  'html5_bundle',
  'mp4_manifest',
  'webm_manifest',
  'otio',
  'edl',
]);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const OutputFileDescriptorSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string(),
  uri: z.string(),
});
export type OutputFileDescriptor = z.infer<typeof OutputFileDescriptorSchema>;

export const ExportManifestSchema = z.object({
  manifestId: z.string(),
  projectId: z.string(),
  format: ExportFormatSchema,
  outputFiles: z.array(OutputFileDescriptorSchema).default([]),
  resolution: z.object({
    width: z.number().int().positive().default(1920),
    height: z.number().int().positive().default(1080),
  }).default({ width: 1920, height: 1080 }),
  fps: z.number().positive().default(24),
  totalDurationSeconds: z.number().nonnegative(),
  checksumSha256: z.string(),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  metadata: z.record(z.unknown()).optional(),
});
export type ExportManifest = z.infer<typeof ExportManifestSchema>;
