import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { submitFeedbackEvent, type FeedbackSurface } from '@/lib/feedback-api';

export type FeedbackValue = 'positive' | 'negative' | null;

type SubmitResult = { error: string | null };

/**
 * Persists thumbs-up/down feedback for a single message.
 * Owns only the DB write + toast — UI state is the caller's responsibility.
 *
 * Writes land in two places: messages.feedback remains the per-message
 * state (drives the selected thumb on reload and the admin Insights
 * aggregation), and each non-null rating also logs a message_rating event
 * in user_feedback (the unified log behind the admin Feedback tab). The
 * event write is best-effort: the rating itself is already saved.
 */
export function useFeedback(messageId: string, surface: FeedbackSurface = 'chat') {
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

      if (value !== null) {
        void submitFeedbackEvent({
          feedback_type: 'message_rating',
          rating: value === 'positive' ? 'up' : 'down',
          message_id: messageId,
          source_surface: surface,
        });
      }

      toast.success('Feedback recorded. Thanks!');
      return { error: null };
    },
    [messageId, surface]
  );

  return { submit, isSaving };
}
