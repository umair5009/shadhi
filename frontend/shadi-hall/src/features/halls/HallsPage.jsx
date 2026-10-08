import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Building2, ImageOff, Plus, Users } from 'lucide-react';
import { hallsApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMoney } from '@/lib/hooks';
import { formatNumber } from '@/lib/format';
import { HALL_FACILITIES, HALL_STATUSES, HALL_STATUS_TONES, labelOf } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, QueryBoundary } from '@/components/ui/Feedback';
import { HallFormDialog } from './HallFormDialog';

export function HallCard({ hall }) {
  const money = useMoney();
  const cover = hall.images?.[0];
  return (
    <Link to={`/halls/${hall._id}`} className="card hall-card">
      <div className="hall-card__cover" style={{ '--hall': hall.color }}>
        {cover ? <img src={cover.url} alt="" loading="lazy" /> : <ImageOff size={28} aria-hidden />}
        <Badge tone={HALL_STATUS_TONES[hall.status]} dot className="hall-card__status">
          {labelOf(HALL_STATUSES, hall.status)}
        </Badge>
      </div>
      <div className="hall-card__body">
        <div className="row row--between">
          <h2 className="hall-card__name">
            <span className="color-dot" style={{ background: hall.color }} aria-hidden /> {hall.name}
          </h2>
          <span className="strong">{money.format(hall.basePrice)}</span>
        </div>
        <div className="row secondary" style={{ gap: 6 }}>
          <Users size={15} aria-hidden /> Up to {formatNumber(hall.capacity)} guests
        </div>
        {hall.facilities.length > 0 && (
          <div className="tag-list">
            {hall.facilities.slice(0, 5).map((facility) => (
              <Badge key={facility} tone="neutral">
                {labelOf(HALL_FACILITIES, facility)}
              </Badge>
            ))}
            {hall.facilities.length > 5 && <Badge>+{hall.facilities.length - 5}</Badge>}
          </div>
        )}
      </div>
    </Link>
  );
}

export function HallsPage() {
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const halls = useQuery({ queryKey: ['halls', 'list'], queryFn: () => hallsApi.list({ limit: 100 }) });

  return (
    <>
      <PageHeader
        title="Halls"
        subtitle="Your venues, their capacity and prices"
        actions={
          can('halls.manage') && (
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              Add hall
            </Button>
          )
        }
      />
      <QueryBoundary query={halls}>
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState icon={Building2} title="No halls yet" action={can('halls.manage') && <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add your first hall</Button>}>
              Add each hall or marquee you rent out, with its capacity and base price.
            </EmptyState>
          ) : (
            <div className="grid grid--cards">
              {data.data.map((hall) => (
                <HallCard key={hall._id} hall={hall} />
              ))}
            </div>
          )
        }
      </QueryBoundary>
      <HallFormDialog open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
