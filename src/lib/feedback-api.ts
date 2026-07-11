// One job: insert a row into the unified user_feedback event log.
// RLS enforces user_id = auth.uid(); the column-level INSERT grant means
// clients can only set these six fields (id/created_at are server-side).

import { supabase } from '@/lib/supabase';

export type FeedbackType = 'bug' | 'feedback' | 'praise' | 'message_rating';
export type FeedbackSurface = 'chat' | 'discovery' | 'fab' | 'settings';

export type FeedbackEvent = {
  feedback_type: FeedbackType;
  source_surface: FeedbackSurface;
  rating?: 'up' | 'down';
  message_id?: string;
  comment?: string;
  // Opt-in follow-up address. Absent = no reply requested.
  contact_email?: string;
};

export async function submitFeedbackEvent(event: FeedbackEvent): Promise<{ error: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return { error: 'Not signed in' };

  const { error } = await supabase.from('user_feedback').insert({
    user_id: userId,
    feedback_type: event.feedback_type,
    source_surface: event.source_surface,
    rating: event.rating ?? null,
    message_id: event.message_id ?? null,
    comment: event.comment?.trim() || null,
    contact_email: event.contact_email?.trim() || null,
  });
  return { error: error ? error.message : null };
}
