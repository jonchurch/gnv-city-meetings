import { WORKFLOW_STEPS, QUEUE_NAMES } from './config.js';
import { updateMeetingState } from '../db/init.js';
import { createQueue } from '../queue/config.js';

/**
 * Advance a meeting to the next step in the workflow
 * @param {string} meetingId - Meeting ID
 * @param {string} currentState - Current meeting state
 * @param {Object} additionalData - Additional data to store with state update
 */
export async function advanceWorkflow(meetingId, currentState, additionalData = {}) {
  const step = WORKFLOW_STEPS[currentState];
  
  if (!step) {
    throw new Error(`Unknown workflow state: ${currentState}`);
  }
  
  console.log(JSON.stringify({
    message: 'Advancing workflow',
    meeting_id: meetingId,
    from_state: currentState,
    to_state: step.nextState,
    next_queue: step.queue,
    step: 'workflow_advance'
  }));
  
  // Update meeting state
  if (step.nextState) {
    await updateMeetingState(meetingId, step.nextState, additionalData);
  }
  
  // Enqueue next job if there is one
  if (step.queue) {
    const queue = createQueue(step.queue);
    await queue.add('process', { meetingId }, {
      jobId: `${step.queue}-${meetingId}`,
    });
    await queue.close();
    
    console.log(JSON.stringify({
      message: 'Enqueued next job',
      meeting_id: meetingId,
      queue: step.queue,
      job_id: `${step.queue}-${meetingId}`,
      step: 'workflow_enqueue'
    }));
  }
}

/**
 * Handle workflow failure
 * @param {string} meetingId - Meeting ID  
 * @param {string} currentState - State where failure occurred
 * @param {Error} error - The error that occurred
 */
export async function handleWorkflowFailure(meetingId, currentState, error) {
  console.error(JSON.stringify({
    message: 'Workflow failure',
    meeting_id: meetingId,
    failed_state: currentState,
    error: error.message,
    stack: error.stack,
    step: 'workflow_failure'
  }));
  
  await updateMeetingState(meetingId, 'FAILED', {
    error: error.message,
    failed_at_state: currentState
  });
}

/**
 * Restart a failed or stuck meeting from a specific state
 * @param {string} meetingId - Meeting ID
 * @param {string} fromState - State to restart from
 */
export async function restartWorkflow(meetingId, fromState) {
  const step = WORKFLOW_STEPS[fromState];
  
  if (!step) {
    throw new Error(`Cannot restart from unknown state: ${fromState}`);
  }
  
  console.log(JSON.stringify({
    message: 'Restarting workflow',
    meeting_id: meetingId,
    restart_from: fromState,
    step: 'workflow_restart'
  }));
  
  // Reset to the starting state
  await updateMeetingState(meetingId, fromState);
  
  // Enqueue the appropriate job
  if (step.queue) {
    const queue = createQueue(step.queue);
    await queue.add('process', { meetingId }, {
      jobId: `${step.queue}-${meetingId}`,
    });
    await queue.close();
  }
}

/**
 * Get the next queue for a given state
 * @param {string} state - Current state
 * @returns {string|null} - Queue name or null if terminal
 */
export function getNextQueue(state) {
  const step = WORKFLOW_STEPS[state];
  return step ? step.queue : null;
}