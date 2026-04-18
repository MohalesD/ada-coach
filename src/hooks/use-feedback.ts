import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export type FeedbackValue = 'positive' | 'negative' | null;

type SubmitResult = { error: string | null };

/**
 * Persists thumbs-up/down feedback for a single message.
 * Owns only the DB write + toast — UI state is the caller's responsibility.
 */
export function useFeedback(messageId: string) {
  const [isSaving, setIsSaving] = useState(false);

  const submit = useCallback(
    async (value: FeedbackValue): Promise<SubmitResult> => {
      setIsSaving(true);
      const { error } = await supabase
        .from('messages')
        .update({ feedback: value })
        .eq('id', messageId);
      setIsSaving(false);

      if (error) {
        toast.error('Could not save feedback. Please try again.');
        return { error: error.message };
      }
      toast.success('Feedback recorded. Thanks!');
      return { error: null };
    },
    [messageId],
  );

  return { submit, isSaving };
}
