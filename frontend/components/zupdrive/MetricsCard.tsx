'use client';

interface MetricsCardProps {
  label: string;
  value: string | number;
  icon: string;
  color: 'green' | 'red' | 'blue' | 'purple';
  status: 'excellent' | 'good' | 'warning' | 'danger';
}

export function MetricsCard({ label, value, icon, color, status }: MetricsCardProps) {
  const statusColors = {
    excellent: 'ring-green-200 bg-green-50',
    good: 'ring-blue-200 bg-blue-50',
    warning: 'ring-yellow-200 bg-yellow-50',
    danger: 'ring-red-200 bg-red-50',
  };

  const iconColors = {
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  const statusEmoji = {
    excellent: '✅',
    good: '✓',
    warning: '⚠️',
    danger: '❌',
  };

  return (
    <div className={`rounded-xl p-4 ring-1 bg-white ${statusColors[status]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-600 uppercase">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`rounded-lg p-3 text-xl ${iconColors[color]}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 text-right">
        <span className="text-sm">{statusEmoji[status]}</span>
      </div>
    </div>
  );
}
