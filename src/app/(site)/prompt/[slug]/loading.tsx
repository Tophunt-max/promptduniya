import { DetailSkeleton, Skeleton } from '@/components/ui/skeleton';

/** Streamed placeholder for a prompt detail page. */
export default function PromptLoading() {
  return (
    <div className="container-page py-6 sm:py-9">
      <Skeleton className="mb-5 h-4 w-64" />
      <DetailSkeleton />

      <div className="mt-16">
        <Skeleton className="mb-5 h-7 w-56" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="aspect-[3/4] rounded-[var(--radius-card)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
