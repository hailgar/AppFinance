export function validApiBase(value: string, development: boolean): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" ||
        (development && url.protocol === "http:")) &&
      !!url.hostname &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname.replace(/\/$/, "") === "/api/v1"
    );
  } catch {
    return false;
  }
}
