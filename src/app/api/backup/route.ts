import { NextResponse } from "next/server";
import { spawn } from "child_process";
import zlib from "zlib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function runPgDump(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const dump = spawn("pg_dump", [process.env.DATABASE_URL!, "--no-owner", "--no-privileges"]);
    const gzip = zlib.createGzip();
    const chunks: Buffer[] = [];
    let stderr = "";
    let gzipDone = false;
    let closeCode: number | null = null;
    let settled = false;

    // El stdout de pg_dump se cierra igual cuando el proceso truena a medias,
    // así que "gzip terminó" por sí solo no basta — hay que esperar también
    // al código de salida real antes de decidir si fue éxito o error.
    function tryFinish() {
      if (settled || !gzipDone || closeCode === null) return;
      settled = true;
      if (closeCode !== 0) {
        reject(new Error(`pg_dump salió con código ${closeCode}: ${stderr}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    }

    dump.stdout.pipe(gzip);
    gzip.on("data", (chunk: Buffer) => chunks.push(chunk));
    gzip.on("end", () => {
      gzipDone = true;
      tryFinish();
    });
    gzip.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    dump.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    dump.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    dump.on("close", (code) => {
      closeCode = code;
      tryFinish();
    });
  });
}

export async function POST(request: Request) {
  const token = request.headers.get("x-backup-token");
  if (!process.env.BACKUP_WEBHOOK_TOKEN || token !== process.env.BACKUP_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const buffer = await runPgDump();
    if (buffer.length < 200) {
      return NextResponse.json(
        { error: `pg_dump produjo un archivo sospechosamente vacío (${buffer.length} bytes).` },
        { status: 500 }
      );
    }

    const fecha = new Date().toISOString().slice(0, 10);
    const nombre = `wolfsys-${fecha}.sql.gz`;

    const s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: nombre,
        Body: buffer,
        ContentType: "application/gzip",
      })
    );

    return NextResponse.json({ success: true, archivo: nombre, bytes: buffer.length });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido en el respaldo.";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
