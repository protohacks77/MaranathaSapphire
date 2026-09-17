import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-800/80 rounded-md ${className}`} />
);

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 5 }) => (
  <div className="w-full bg-[#161B22] border border-gray-800 rounded-lg overflow-hidden p-4 space-y-4">
    <div className="flex justify-between items-center pb-2 border-b border-gray-800">
      <Skeleton className="h-6 w-1/4" />
      <Skeleton className="h-8 w-32" />
    </div>
    <div className="space-y-3">
      {/* Table Header */}
      <div className="grid gap-4 py-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-3/4" />
        ))}
      </div>
      {/* Table Rows */}
      {Array.from({ length: rows }).map((_, rIndex) => (
        <div key={rIndex} className="grid gap-4 py-3 border-t border-gray-800/50 items-center" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, cIndex) => (
            <Skeleton key={cIndex} className={`h-4 ${cIndex === 0 ? 'w-5/6' : cIndex === cols - 1 ? 'w-1/2' : 'w-2/3'}`} />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-[#161B22] border border-gray-800 p-5 rounded-lg space-y-3">
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    ))}
  </div>
);

export const FormSkeleton: React.FC<{ fields?: number }> = ({ fields = 6 }) => (
  <div className="bg-[#161B22] border border-gray-800 p-6 rounded-lg space-y-6">
    <Skeleton className="h-7 w-1/3 mb-4" />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
    <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
      <Skeleton className="h-10 w-24" />
      <Skeleton className="h-10 w-32" />
    </div>
  </div>
);

export const ProfileSkeleton: React.FC = () => (
  <div className="space-y-6">
    {/* Header Card */}
    <div className="bg-[#161B22] border border-gray-800 p-6 rounded-lg flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="flex gap-2 w-full md:w-auto">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-28" />
      </div>
    </div>
    {/* Content Skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-[#161B22] border border-gray-800 p-4 rounded-lg space-y-3">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
      <div className="lg:col-span-2">
        <TableSkeleton rows={4} cols={4} />
      </div>
    </div>
  </div>
);

export const ModalSkeleton: React.FC<{ items?: number }> = ({ items = 4 }) => (
  <div className="space-y-4 p-2">
    <div className="flex justify-between items-center pb-3 border-b border-gray-800">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-6 w-16" />
    </div>
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3 bg-gray-800/40 rounded-md">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="space-y-2 flex-grow">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const PageSkeleton: React.FC<{ type?: 'dashboard' | 'table' | 'cards' | 'form' | 'profile' }> = ({ type = 'table' }) => (
  <div className="space-y-6 animate-fadeIn">
    {/* Page Header */}
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-800">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-10 w-36" />
    </div>

    {/* Body depending on type */}
    {type === 'dashboard' && (
      <div className="space-y-6">
        <CardSkeleton count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TableSkeleton rows={4} cols={3} />
          <TableSkeleton rows={4} cols={3} />
        </div>
      </div>
    )}

    {type === 'table' && (
      <div className="space-y-4">
        <div className="flex justify-between items-center gap-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-10 w-40" />
        </div>
        <TableSkeleton rows={6} cols={5} />
      </div>
    )}

    {type === 'cards' && (
      <div className="space-y-4">
        <CardSkeleton count={6} />
      </div>
    )}

    {type === 'form' && <FormSkeleton />}
    {type === 'profile' && <ProfileSkeleton />}
  </div>
);

export default PageSkeleton;
