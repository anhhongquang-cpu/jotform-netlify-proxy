export default async (request, context) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. Phân loại và định tuyến chính xác Server đích của Jotform
  let targetHost = "form.jotform.me";

  if (pathname.startsWith("/submit/")) {
    targetHost = "submit.jotform.me";
  } else if (
    pathname.startsWith("/static/") ||
    pathname.startsWith("/themes/") ||
    pathname.startsWith("/css/") ||
    pathname.startsWith("/js/") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/uploads/")
  ) {
    // Các asset giao diện, logo, background nằm trên CDN
    targetHost = "cdn.jotfor.ms";
  }

  // 2. Tạo URL đích
  const targetUrl = new URL(`https://${targetHost}${pathname}${url.search}`);

  // 3. Chuẩn bị Headers
  const modifiedHeaders = new Headers(request.headers);
  modifiedHeaders.set("Host", targetHost);
  modifiedHeaders.set("Referer", `https://${targetHost}/`);
  modifiedHeaders.set("Origin", `https://${targetHost}`);
  modifiedHeaders.delete("accept-encoding"); // Bắt buộc để nhận plain text decode

  // 4. Thiết lập Fetch Options
  const fetchOptions = {
    method: request.method,
    headers: modifiedHeaders,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    fetchOptions.body = await request.arrayBuffer();
  }

  // 5. Gửi request sang Jotform CDN / Server
  let response;
  try {
    response = await fetch(targetUrl.toString(), fetchOptions);
  } catch (err) {
    return new Response("Proxy fetch failed: " + err.message, { status: 502 });
  }

  // 6. Xử lý Headers trả về
  const responseHeaders = new Headers(response.headers);
  
  // Xóa các header bảo mật gắt gao chặn load ảnh/CSS trên domain lạ
  responseHeaders.delete("content-security-policy");
  responseHeaders.delete("x-frame-options");

  // Xử lý Location redirect khi submit thành công
  const locationHeader = responseHeaders.get("location");
  const jotformHosts = [
    "submit.jotform.com",
    "submit.jotform.me",
    "submit.jotformpro.com",
    "submit.jotformeu.com",
    "form.jotform.com",
    "form.jotform.me",
    "form.jotformpro.com",
    "form.jotformz.com",
    "www.jotform.com",
    "cdn.jotfor.ms",
    "files.jotform.com"
  ];

  if (locationHeader) {
    let fixedLocation = locationHeader;
    for (const host of jotformHosts) {
      fixedLocation = fixedLocation
        .replaceAll(`https://${host}`, `https://${url.host}`)
        .replaceAll(`http://${host}`, `https://${url.host}`)
        .replaceAll(host, url.host);
    }
    responseHeaders.set("location", fixedLocation);
  }

  // 7. Thay thế toàn bộ domain trong nội dung Text (HTML / CSS / JS / JSON)
  const contentType = responseHeaders.get("content-type") || "";
  if (
    contentType.includes("text/") ||
    contentType.includes("javascript") ||
    contentType.includes("application/json")
  ) {
    let bodyText = await response.text();

    for (const host of jotformHosts) {
      bodyText = bodyText.replaceAll(`https://${host}`, `https://${url.host}`);
      bodyText = bodyText.replaceAll(`http://${host}`, `https://${url.host}`);
      bodyText = bodyText.replaceAll(`//${host}`, `//${url.host}`);
      bodyText = bodyText.replaceAll(host, url.host);
    }

    responseHeaders.delete("content-length");

    return new Response(bodyText, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }

  // 8. Trả về assets nhị phân (Ảnh nền giọt nước, logo PNG/JPG, font icon)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};

export const config = {
  path: "/*",
};
