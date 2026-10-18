export async function register() {
  if(process.env.NEXT_RUNTIME==="nodejs") {const {environment}=await import("./lib/env");environment();}
}
