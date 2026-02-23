import 'dotenv/config';
import http from 'http';
import handler from './api/hands/[id]';

const PORT = 3001;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  
  if (url.pathname.startsWith('/hands/')) {
    const id = url.pathname.replace('/hands/', '');
    const mockReq = {
      method: req.method,
      query: { id },
      body: {},
      headers: req.headers,
    };
    
    const mockRes = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: '',
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      setHeader(key: string, value: string) {
        this.headers[key] = value;
        return this;
      },
      send(data: string) {
        this.body = data;
        res.writeHead(this.statusCode, this.headers);
        res.end(data);
        return this;
      },
      json(data: object) {
        this.setHeader('Content-Type', 'application/json');
        return this.send(JSON.stringify(data));
      },
    };
    
    try {
      await handler(mockReq as any, mockRes as any);
    } catch (error) {
      console.error('Handler error:', error);
      res.writeHead(500);
      res.end('Internal server error');
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
  console.log(`Test hand replay: http://localhost:${PORT}/hands/YOUR_SHARE_ID`);
});
