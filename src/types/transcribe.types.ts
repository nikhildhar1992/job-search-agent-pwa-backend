export interface TranscribeResult {
  success: true;
  transcript: string;
  country: string;
  platform: string;
}

export interface VoiceTargetHints {
  country: string;
  platform: string;
}
