import { TransactionResultNameToNumber, TransactionStatus } from 'genlayer-js/types';

const majorityAgree = Number(TransactionResultNameToNumber.MAJORITY_AGREE);

export function transactionOutcome(tx) {
  const status = tx?.statusName || 'PENDING';
  if (status === TransactionStatus.FINALIZED) {
    const leaderSucceeded = tx?.consensus_data?.leader_receipt?.some(
      (receipt) => receipt.mode === 'leader' && receipt.execution_result === 'SUCCESS',
    );
    const success = Number(tx.result) === majorityAgree && leaderSucceeded;
    return { phase: success ? 'finalized-success' : 'finalized-error', terminal: true, status };
  }
  if ([TransactionStatus.CANCELED, TransactionStatus.UNDETERMINED].includes(status)) {
    return { phase: 'finalized-error', terminal: true, status };
  }
  if (status === TransactionStatus.ACCEPTED || status === TransactionStatus.READY_TO_FINALIZE) {
    return { phase: 'accepted', terminal: false, status };
  }
  return { phase: 'pending', terminal: false, status };
}
