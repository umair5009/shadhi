import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CalendarCheck, ImagePlus, Pencil, Trash2, X, Users, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { bookingsApi, hallsApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiMutation, useMoney, useToday } from '@/lib/hooks';
import { formatDate, formatNumber, formatTimeRange } from '@/lib/format';
import { EVENT_TYPES, HALL_FACILITIES, HALL_STATUSES, HALL_STATUS_TONES, labelOf } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge, BookingStatusBadge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { DataTable } from '@/components/ui/DataTable';
import { HallFormDialog } from './HallFormDialog';

export function HallDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const money = useMoney();
  const today = useToday();
  const confirm = useConfirm();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const hallQuery = useQuery({ queryKey: ['halls', id], queryFn: () => hallsApi.get(id) });
  const upcoming = useQuery({
    queryKey: ['bookings', 'list', { hall: id, upcoming: true, limit: 10 }],
    queryFn: () => bookingsApi.list({ hall: id, upcoming: true, limit: 10 }),
    enabled: can('bookings.view'),
  });
  const removeImage = useApiMutation((key) => hallsApi.removeImage(id, key), { success: 'Photo removed', invalidate: [['halls']] });
  const removeHall = useApiMutation(() => hallsApi.remove(id), {
    success: 'Hall deleted',
    invalidate: [['halls']],
    onSuccess: () => navigate('/halls'),
  });

  if (hallQuery.isLoading) return <PageLoader />;
  if (hallQuery.isError) return <ErrorState error={hallQuery.error} onRetry={() => hallQuery.refetch()} />;
  const hall = hallQuery.data;
  const canManage = can('halls.manage');

  const upload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      await hallsApi.addImages(id, [...files]);
      await queryClient.invalidateQueries({ queryKey: ['halls'] });
      toast.success('Photos added');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const askDelete = async () => {
    const ok = await confirm({
      title: `Delete ${hall.name}?`,
      message: 'Halls with bookings can’t be deleted — set them to Inactive instead so their history is kept.',
      confirmLabel: 'Delete hall',
      danger: true,
    });
    if (ok) removeHall.mutate();
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Halls', to: '/halls' }, { label: hall.name }]}
        title={
          <>
            <span className="color-dot" style={{ background: hall.color, width: 14, height: 14 }} aria-hidden />
            {hall.name}
            <Badge tone={HALL_STATUS_TONES[hall.status]} dot>
              {labelOf(HALL_STATUSES, hall.status)}
            </Badge>
          </>
        }
        subtitle={hall.description}
        actions={
          <>
            <Button icon={CalendarDays} to={`/calendar?hall=${hall._id}`}>
              Availability
            </Button>
            {canManage && (
              <>
                <Button variant="ghost" icon={Trash2} onClick={askDelete}>
                  Delete
                </Button>
                <Button icon={Pencil} onClick={() => setEditing(true)}>
                  Edit
                </Button>
              </>
            )}
            {can('bookings.create') && hall.status !== 'inactive' && (
              <Button variant="primary" to={`/bookings/new?hall=${hall._id}&date=${today}`}>
                Book this hall
              </Button>
            )}
          </>
        }
      />
      <div className="stack stack--lg">
        <div className="grid grid--4">
          <StatCard label="Capacity" icon={Users} value={`${formatNumber(hall.capacity)} guests`} />
          <StatCard label="Base price" icon={TrendingUp} tone="gold" value={money.format(hall.basePrice)} meta={hall.hourlyPrice ? `${money.format(hall.hourlyPrice)} per hour` : undefined} />
          <StatCard label="Upcoming events" icon={CalendarCheck} tone="info" value={formatNumber(hall.stats.upcomingEvents)} meta={`${hall.stats.eventsThisMonth} this month`} />
          {can('payments.view') && <StatCard label="Booked value (all time)" icon={TrendingUp} tone="success" value={money.format(hall.stats.bookedValue)} meta={`${hall.stats.totalEvents} events`} />}
        </div>

        <div className="split">
          <div className="stack">
            {can('bookings.view') && (
              <Card>
                <CardHeader title="Upcoming events in this hall" />
                <DataTable
                  columns={[
                    { key: 'date', header: 'Date', render: (row) => <span className="table-primary nowrap">{formatDate(row.eventDate, 'EEE, dd MMM yyyy')}</span> },
                    { key: 'time', header: 'Time', render: (row) => <span className="nowrap">{formatTimeRange(row.startTime, row.endTime)}</span> },
                    {
                      key: 'customer',
                      header: 'Customer',
                      mobile: 'title',
                      render: (row) => (
                        <>
                          <div>{row.customer?.fullName}</div>
                          <div className="table-secondary">{labelOf(EVENT_TYPES, row.eventType)}</div>
                        </>
                      ),
                    },
                    { key: 'guests', header: 'Guests', align: 'right', render: (row) => formatNumber(row.guestCount) },
                    { key: 'status', header: 'Status', render: (row) => <BookingStatusBadge status={row.status} /> },
                  ]}
                  rows={upcoming.data?.data}
                  loading={upcoming.isLoading}
                  error={upcoming.error}
                  onRowClick={(row) => navigate(`/bookings/${row._id}`)}
                  empty={<EmptyState compact icon={CalendarDays} title="No upcoming events" />}
                />
              </Card>
            )}
            <Card>
              <CardHeader title="Photos" subtitle="Shown on the hall card" />
              <CardBody>
                <div className="photo-grid">
                  {hall.images.map((image) => (
                    <div key={image.key} className="photo">
                      <img src={image.url} alt={hall.name} loading="lazy" />
                      {canManage && <IconButton className="photo__remove" icon={X} label="Remove photo" size="sm" onClick={() => removeImage.mutate(image.key)} />}
                    </div>
                  ))}
                  {canManage && hall.images.length < 8 && (
                    <label className="upload-drop">
                      <ImagePlus size={22} aria-hidden />
                      {uploading ? 'Uploading…' : 'Add photos'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" disabled={uploading} onChange={(event) => upload(event.target.files)} />
                    </label>
                  )}
                </div>
                {!canManage && hall.images.length === 0 && <p className="muted">No photos yet.</p>}
              </CardBody>
            </Card>
          </div>
          <Card>
            <CardHeader title="Facilities" />
            <CardBody>
              {hall.facilities.length === 0 ? (
                <p className="muted">No facilities listed.</p>
              ) : (
                <ul className="facility-list">
                  {HALL_FACILITIES.map((facility) => (
                    <li key={facility.value} className={hall.facilities.includes(facility.value) ? '' : 'facility-list__missing'}>
                      {facility.label}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
      <HallFormDialog open={editing} onClose={() => setEditing(false)} hall={hall} />
    </>
  );
}
