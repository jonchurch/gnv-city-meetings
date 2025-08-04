import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

export const connection = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
});

// export const QUEUE_NAMES = {
//   PROCESS_MEETING: 'processMeeting',
//   DIARIZE: 'diarize',
// };

export const createQueue = (queueName) => {
  return new Queue(queueName, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        count: 100,
      },
      removeOnFail: {
        count: 500,
      },
    },
  });
};

export const createWorker = (queueName, processor, options = {}) => {
  return new Worker(queueName, processor, {
    connection,
    concurrency: 1,
    ...options,
  });
};

export const createQueueEvents = (queueName) => {
  return new QueueEvents(queueName, { connection });
};
