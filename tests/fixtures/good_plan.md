# Goal

Add exponential backoff retry to worker jobs that fail with transient network errors.

# Steps

1. Add retry decorator to `WorkerJob.execute()` with initial_delay=1s, multiplier=2.0, max_delay=30s, max_attempts=5.
2. Log each retry attempt with job_id, attempt_number, and error_type.
3. After retry exhaustion, transition job state from RUNNING to FAILED_EXHAUSTED.

# Acceptance Criteria

PASS if worker recovers from 3 consecutive transient failures within 60 seconds,
and no job remains in RUNNING state after retry exhaustion.
Run: simulate_worker_failure.py --failures 3 --interval 5s

# Rollback

Revert commit. Re-deploy previous image tag. Verify RUNNING jobs drain within 30s.
