## Docker Volume Permission Issues on WSL: A Debugging Journey

### The Problem
We were running a WhisperX Docker container for audio transcription/diarization, mounting a temporary directory as a volume for input/output. The container kept failing with:
```
PermissionError: [Errno 13] Permission denied: '/app/b27b5bd3-369f-4a0a-a942-255b10698bd2_audio.json'
```

### Initial Investigation
1. **Setup**: Node.js worker creates temp directory → mounts to Docker → container processes file → writes output
2. **Mount**: `-v "/tmp/diarize_${meetingId}_${timestamp}:/app"`
3. **Failure**: Container could read the input file but couldn't write output

### First Fix Attempt
Added explicit permissions when creating the directory:
```javascript
await fs.mkdir(tempDir, { recursive: true, mode: 0o777 });
```

**Result**: Still failed! 

### The Discovery
When we checked the actual directory permissions:
```bash
$ ls -ld /tmp/diarize_b27b5bd3-369f-4a0a-a942-255b10698bd2_1754358314051
drwxr-xr-x 2 whisper whisper 4096 Aug  4 21:45 /tmp/diarize_...
```

Directory had `755` instead of `777`! 

### Root Cause: WSL umask
- WSL default umask: `022`
- Requested permissions: `777` (rwxrwxrwx)
- Actual permissions: `777 & ~022 = 755` (rwxr-xr-x)
- The umask was filtering out write permissions for group/others

### The Solution
Explicitly set permissions after creation:
```javascript
await fs.mkdir(tempDir, { recursive: true, mode: 0o777 });
await fs.chmod(tempDir, 0o777);  // Force permissions despite umask
```

### Alternative Approach
Run container as current user instead of fighting permissions:
```bash
docker run --user $(id -u):$(id -g) ...
```

### Key Lesson
When debugging Docker volume permissions on WSL, always check the actual permissions created - the umask may be silently modifying your requested permissions. The `mode` parameter in `fs.mkdir()` is just a suggestion that gets filtered by umask.
