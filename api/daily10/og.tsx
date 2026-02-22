import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name') || 'Someone';
  const score = searchParams.get('score') || '0';
  const maxScore = searchParams.get('maxScore') || '100';
  const grid = searchParams.get('grid') || '';

  const squares = grid.split('').map((ch) => ch === '1');
  const firstRow = squares.slice(0, 5);
  const secondRow = squares.slice(5, 10);

  const scoreNum = Math.round(parseFloat(score));
  const maxScoreNum = Math.round(parseFloat(maxScore));

  const logoUrl = 'https://stackpoker.gg/images/logo.png';

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1200px',
          height: '630px',
          backgroundColor: '#0B0E13',
          fontFamily: 'sans-serif',
          color: 'white',
        }}
      >
        {/* Title: @user scored X/Y on [logo] */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '52px' }}>
          <div style={{ display: 'flex', fontSize: '50px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
            @{name} scored {scoreNum}/{maxScoreNum} on
          </div>
          <img src={logoUrl} width={240} height={60} />
        </div>

        {/* Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {[firstRow, secondRow].map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: '20px' }}>
              {row.map((ok, ci) => (
                <div
                  key={ci}
                  style={{
                    width: '150px',
                    height: '150px',
                    borderRadius: '24px',
                    backgroundColor: ok ? '#22C55E' : 'rgba(239,68,68,0.65)',
                    display: 'flex',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
