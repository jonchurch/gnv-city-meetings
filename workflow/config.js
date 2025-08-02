export const WORKFLOW_STEPS = {
  DISCOVERED: { 
    nextState: 'DOWNLOADED', 
    queue: 'download',
    description: 'Meeting found and stored in database'
  },
  DOWNLOADED: { 
    nextState: 'EXTRACTED', 
    queue: 'extract',
    description: 'Video file downloaded to storage'
  },
  EXTRACTED: { 
    nextState: 'UPLOADED', 
    queue: 'upload',
    description: 'Agenda and chapters extracted'
  },
  UPLOADED: { 
    nextState: 'DIARIZED', 
    queue: 'diarize',
    description: 'Video uploaded to YouTube'
  },
  DIARIZED: { 
    nextState: null, 
    queue: null,
    description: 'Audio transcribed and diarized (terminal state)'
  },
  FAILED: { 
    nextState: null, 
    queue: null,
    description: 'Processing failed (terminal state)'
  }
};

export const QUEUE_NAMES = {
  DOWNLOAD: 'download',
  EXTRACT: 'extract', 
  UPLOAD: 'upload',
  DIARIZE: 'diarize'
};

// Legacy queue name for backward compatibility
export const LEGACY_QUEUE_NAMES = {
  PROCESS_MEETING: 'processMeeting',
  DIARIZE: 'diarize'
};