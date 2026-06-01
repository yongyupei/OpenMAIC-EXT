/**
 * @extends-from lib/teacher/collect-export-audio.ts
 * @fork-branch feat/html-slide-design-workbench
 */
export {
  buildExportAudioZip,
  prepareScenesForVideoExport,
  type PrepareVideoExportAudioResult,
} from '@/lib/teacher/prepare-video-export-audio';
export {
  buildLecturePlan,
  canonicalSpeechAudioId,
  scenesNeedClientAudioUpload,
} from '@/lib/lecture-timeline';
