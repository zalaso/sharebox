// Lettura del valore di un segreto: mai dagli argomenti del comando (finirebbe nella cronologia della shell).
// Da terminale si digita senza che compaia a schermo; da uno script arriva su stdin.

export async function readSecret(prompt: string, input: NodeJS.ReadStream = process.stdin, output: NodeJS.WriteStream = process.stderr): Promise<string> {
  if (!input.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of input as AsyncIterable<Buffer>) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }

  output.write(prompt);
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const done = (result: string | null) => {
      input.setRawMode(false);
      input.pause();
      input.off("data", onData);
      output.write("\n");
      if (result === null) reject(new Error("annullato"));
      else resolve(result);
    };
    const onData = (data: Buffer) => {
      for (const char of data.toString("utf8")) {
        if (char === "\r" || char === "\n") return done(value);
        if (char === "\u0003") return done(null); // Ctrl+C
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    input.on("data", onData);
  });
}
