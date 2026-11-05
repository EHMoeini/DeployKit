import { apiRequest } from './api-client.js';
import { podState } from './pod-state.js';

/**
 * @template T
 * @typedef {Object} OrchestrationResult
 * @property {T} data
 * @property {string} podId
 */

/**
 * Server-side Orchestration Adapter Interface & Client Bridge
 * Isolates presentation logic from underlying container orchestration.
 */
export class OrchestrationAdapter {
    /**
     * Dispatch an orchestrated action to backend
     * @template T
     * @param {string} endpoint
     * @param {RequestInit} [options]
     * @returns {Promise<OrchestrationResult<T>>}
     */
    async dispatch(endpoint, options = {}) {
        const response = await apiRequest(endpoint, options);
        const headerPodId = response.headers.get('x-pod-id');
        if (headerPodId) {
            podState.setPodId(headerPodId);
        }

        let data;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await response.json();
            if (data && data.podId) {
                podState.setPodId(data.podId);
            }
        } else {
            data = await response.text();
        }

        if (!response.ok) {
            const errorMsg = (data && data.error) || response.statusText || 'Request failed';
            const err = new Error(errorMsg);
            err.status = response.status;
            err.data = data;
            throw err;
        }

        const currentPodId = podState.getPodId() || headerPodId || 'pod-local';
        return {
            data,
            podId: currentPodId,
        };
    }

    /**
     * Resolve current pod identifier on startup
     */
    async resolvePod() {
        try {
            const res = await fetch('/health/live');
            const podHeader = res.headers.get('x-pod-id');
            if (podHeader) {
                podState.setPodId(podHeader);
            }
        } catch (e) {
            // Pod will resolve on subsequent API calls
        }
    }
}

export const orchestrationAdapter = new OrchestrationAdapter();
