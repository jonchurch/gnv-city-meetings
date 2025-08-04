/**
 * Client for the Meetings API
 * This replaces direct database access for distributed workers
 */

const API_HOST = process.env.MEETINGS_API_HOST || 'muadib';
const API_PORT = process.env.MEETINGS_API_PORT || 3001;
const API_BASE = `http://${API_HOST}:${API_PORT}/api`;

/**
 * Get a meeting by ID
 */
export async function getMeeting(meetingId) {
  const response = await fetch(`${API_BASE}/meetings/${meetingId}`);
  
  if (response.status === 404) {
    return null;
  }
  
  if (!response.ok) {
    throw new Error(`Failed to get meeting: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Get meetings by state
 */
export async function getMeetingsByState(state) {
  const response = await fetch(`${API_BASE}/meetings?state=${state}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get meetings: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Update meeting state
 */
export async function updateMeetingState(meetingId, state, additionalData = {}) {
  const response = await fetch(`${API_BASE}/meetings/${meetingId}/state`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ state, data: additionalData }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to update meeting state: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Create a new meeting
 */
export async function insertMeeting(meeting) {
  const response = await fetch(`${API_BASE}/meetings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(meeting),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create meeting: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Update meeting fields
 */
export async function updateMeeting(meetingId, updates) {
  const response = await fetch(`${API_BASE}/meetings/${meetingId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to update meeting: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Check API health
 */
export async function checkHealth() {
  try {
    const response = await fetch(`http://${API_HOST}:${API_PORT}/health`);
    return response.ok;
  } catch (error) {
    return false;
  }
}