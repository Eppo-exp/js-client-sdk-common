import {
  DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
  DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
  POLL_JITTER_PCT,
} from './constants';

export interface IPoller {
  start: () => Promise<void>;
  stop: () => void;
}

// TODO: change this to a class with methods instead of something that returns a function

export default function initPoller(
  intervalMs: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: () => Promise<any>,
  options?: {
    maxPollRetries?: number;
    maxStartRetries?: number;
    // TODO: consider enum for polling behavior (NONE, SUCCESS, ALWAYS)
    pollAfterSuccessfulStart?: boolean;
    errorOnFailedStart?: boolean;
    pollAfterFailedStart?: boolean;
  },
): IPoller {
  let stopped = false;
  let failedAttempts = 0;
  let nextPollMs = intervalMs;
  let previousPollFailed = false;

  const start = async () => {
    stopped = false;
    let startRequestSuccess = false;
    let startAttemptsRemaining =
      1 + (options?.maxStartRetries ?? DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES);

    let startErrorToThrow = null;

    while (!startRequestSuccess && startAttemptsRemaining > 0) {
      try {
        await callback();
        startRequestSuccess = true;
        previousPollFailed = false;
        console.log('Eppo SDK successfully requested initial configuration');
      } catch (pollingError) {
        previousPollFailed = true;
        console.warn(
          `Eppo SDK encountered an error with initial poll of configurations: ${pollingError.message}`,
        );
        if (--startAttemptsRemaining > 0) {
          const jitterMs = randomJitterMs(intervalMs);
          console.warn(
            `Eppo SDK will retry the initial poll again in ${jitterMs} ms (${startAttemptsRemaining} attempts remaining)`,
          );
          await new Promise((resolve) => setTimeout(resolve, jitterMs));
        } else {
          if (options?.pollAfterFailedStart) {
            console.warn('Eppo SDK initial poll failed; will attempt regular polling');
          } else {
            console.error('Eppo SDK initial poll failed. Aborting polling');
            stop();
          }

          if (options?.errorOnFailedStart) {
            startErrorToThrow = pollingError;
          }
        }
      }
    }

    const startRegularPolling =
      !stopped &&
      ((startRequestSuccess && options?.pollAfterSuccessfulStart) ||
        (!startRequestSuccess && options?.pollAfterFailedStart));

    if (startRegularPolling) {
      console.log(`Eppo SDK starting regularly polling every ${intervalMs} ms`);
      setTimeout(poll, intervalMs);
    } else {
      console.log(`Eppo SDK will not poll for configuration updates`);
    }

    if (startErrorToThrow) {
      console.log('Eppo SDK rethrowing start error');
      throw startErrorToThrow;
    }
  };

  const stop = () => {
    if (!stopped) {
      stopped = true;
      console.log('Eppo SDK polling stopped');
    }
  };

  async function poll() {
    if (stopped) {
      return;
    }

    try {
      await callback();
      // If no error, reset any retrying
      failedAttempts = 0;
      nextPollMs = intervalMs;
      if (previousPollFailed) {
        previousPollFailed = false;
        console.log('Eppo SDK poll successful; resuming normal polling');
      }
    } catch (error) {
      previousPollFailed = true;
      console.warn(`Eppo SDK encountered an error polling configurations: ${error.message}`);
      const maxTries = 1 + (options?.maxPollRetries ?? DEFAULT_POLL_CONFIG_REQUEST_RETRIES);
      if (++failedAttempts < maxTries) {
        const failureWaitMultiplier = Math.pow(2, failedAttempts);
        const jitterMs = randomJitterMs(intervalMs);
        nextPollMs = failureWaitMultiplier * intervalMs + jitterMs;
        console.warn(
          `Eppo SDK will try polling again in ${nextPollMs} ms (${
            maxTries - failedAttempts
          } attempts remaining)`,
        );
      } else {
        console.error(
          `Eppo SDK reached maximum of ${failedAttempts} failed polling attempts. Stopping polling`,
        );
        stop();
      }
    }

    setTimeout(poll, nextPollMs);
  }

  return {
    start,
    stop,
  };
}

/**
 * Compute a random jitter as a percentage of the polling interval.
 * Will be (5%,10%) of the interval assuming POLL_JITTER_PCT = 0.1
 */
function randomJitterMs(intervalMs: number) {
  const halfPossibleJitter = (intervalMs * POLL_JITTER_PCT) / 2;
  // We want the randomly chosen jitter to be at least 1ms so total jitter is slightly more than half the max possible.
  // This makes things easy for automated tests as two polls cannot execute within the maximum possible time waiting for one.
  const randomOtherHalfJitter = Math.max(
    Math.floor((Math.random() * intervalMs * POLL_JITTER_PCT) / 2),
    1,
  );
  return halfPossibleJitter + randomOtherHalfJitter;
}
