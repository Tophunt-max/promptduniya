import { PromptGridSkeleton, Skeleton } from '@/components/ui/skeleton';

/** Streamed placeholder for the explore listing. */
export default function ExploreLoading() {
  return (
    <div className="container-page py-8 sm:py-10">
      <div className="mb-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
      </div>

      <div className="flex gap-8">
        <div className="hidden w-60 shrink-0 lg:block">
          <div className="grid gap-5">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="grid gap-2">
                <Skeleton className="h-4 w-24" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-7 w-16 rounded-full" />
                  <Skeleton className="h-7 w-20 rounded-full" />
                  <Skeleton className="h-7 w-14 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
          <PromptGridSkeleton count={8} />
        </div>
      </div>
    </div>
  );
}
