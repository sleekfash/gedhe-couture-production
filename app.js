/** Namecheap cPanel/Passenger startup file. The generated Nitro entry owns the HTTP listener. */
process.env.NODE_ENV ||= "production";

await import("./.output/server/index.mjs");
