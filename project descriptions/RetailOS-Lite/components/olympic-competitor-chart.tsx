type Props = {
  olympic: number;
  competitor: number;
};

export function OlympicCompetitorChart({ olympic, competitor }: Props) {
  const maxCount = Math.max(olympic, competitor, 1);
  const rows = [
    { name: "Olympic", count: olympic, fill: "bg-[#E8A317]" },
    { name: "Competitor", count: competitor, fill: "bg-[#E07A5F]" },
  ];

  return (
    <div className="w-full space-y-3">
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.name} className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-2">
            <span className="text-right text-xs font-medium text-navy">{row.name}</span>
            <div className="h-6 rounded-r-md bg-[#eef2fb]">
              {row.count > 0 && (
                <div
                  className={`h-full rounded-r-md ${row.fill}`}
                  style={{ width: `${(row.count / maxCount) * 100}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 pl-[84px] text-xs text-muted-foreground">
        <span>Olympic: {olympic}</span>
        <span className="text-right">Competitor: {competitor}</span>
      </div>
    </div>
  );
}
