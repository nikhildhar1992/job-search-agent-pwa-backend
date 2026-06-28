export interface SeenJobRecord {
  id: string;
  url: string;
  title: string;
  company: string;
  platform: string;
  firstSeenAt: string;
}

export interface SeenJobsStore {
  jobs: SeenJobRecord[];
}
