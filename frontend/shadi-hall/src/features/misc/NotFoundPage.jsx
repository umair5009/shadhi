import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <EmptyState icon={Compass} title="This page doesn’t exist" action={<Button variant="primary" to="/">Back to the start</Button>}>
      The link may be old or mistyped.
    </EmptyState>
  );
}
