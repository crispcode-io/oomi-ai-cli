import { createChannelPluginClient } from './channelPluginClient.js';

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function failureCodeFor(error) {
  if (error && typeof error === 'object' && typeof error.code === 'string' && error.code.trim()) {
    return error.code.trim();
  }
  return 'persona_job_delivery_failed';
}

export function startPersonaJobPoller({
  backendUrl,
  deviceToken,
  onMessage,
  fetchImpl = globalThis.fetch,
  metadataType = 'persona_job',
  pollIntervalMs = 3000,
  idleIntervalMs = 3000,
  logger = console,
}) {
  if (typeof onMessage !== 'function') {
    throw new Error('onMessage callback is required.');
  }

  const client = createChannelPluginClient({
    backendUrl,
    deviceToken,
    fetchImpl,
  });

  let stopped = false;
  let activeLoop = null;

  async function loop() {
    while (!stopped) {
      try {
        const payload = await client.pollMessages({
          limit: 10,
          metadataType,
        });
        const messages = Array.isArray(payload?.messages) ? payload.messages : [];

        if (messages.length === 0) {
          await wait(idleIntervalMs);
          continue;
        }

        for (const message of messages) {
          if (stopped) break;

          try {
            await onMessage(message);
            await client.ackMessage({
              messageId: message?.messageId,
              outcome: 'delivered',
            });
          } catch (error) {
            const messageId = typeof message?.messageId === 'string' ? message.messageId : '';
            try {
              if (messageId) {
                await client.ackMessage({
                  messageId,
                  outcome: 'failed',
                  failureCode: failureCodeFor(error),
                });
              }
            } catch (ackError) {
              logger.error?.(
                `[persona-jobs] failed to ack message ${messageId || 'unknown'}: ${
                  ackError instanceof Error ? ackError.message : String(ackError)
                }`
              );
            }

            logger.error?.(
              `[persona-jobs] execution failed for ${messageId || 'unknown'}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }

        if (stopped) {
          break;
        }
        await wait(pollIntervalMs);
      } catch (error) {
        logger.error?.(
          `[persona-jobs] poll failed: ${error instanceof Error ? error.message : String(error)}`
        );
        if (stopped) {
          break;
        }
        await wait(idleIntervalMs);
      }
    }
  }

  activeLoop = loop();

  return {
    stop() {
      stopped = true;
    },
    completed: activeLoop,
  };
}
