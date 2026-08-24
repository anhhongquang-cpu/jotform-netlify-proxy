export default async (request, context) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. Xác định host đích dựa trên đường dẫn request
  let targetHost = "form.jotform.me";
  if (pathname.startsWith("/submit/")) {
    targetHost = "submit.jotform.me";
  }

  // 2. Chuyển tiếp đúng path và query parameters từ link người dùng gọi
  const targetUrl = new URL(`https://${targetHost}${pathname}${url.search}`);

  // 3. Clone và thiết lập lại Headers
  const modifiedHeaders = new Headers(request.headers);
  modifiedHeaders.set("Host", targetHost);
  modifiedHeaders.set("Referer", `https://${targetHost}/`);
  modifiedHeaders.set("Origin", `https://${targetHost}`);
  // Xóa nén gzip để đọc và thay thế text HTML/JS
  modifiedHeaders.delete("accept-encoding");

  // 4. Thiết lập Fetch options (chuyển tiếp đầy đủ Body khi Submit)
  const fetchOptions = {
    method: request.method,
    headers: modifiedHeaders,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    fetchOptions.body = await request.arrayBuffer();
  }

  // 5. Gửi request sang máy chủ Jotform
  const response = await fetch(targetUrl.toString(), fetchOptions);

  // 6. Xử lý Header Location khi Jotform phản hồi redirect (sau submit)
  const responseHeaders = new Headers(response.headers);
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
    "cdn.jotfor.ms"
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

  // 7. Thay thế toàn bộ endpoint Submit và domain trong nội dung HTML/JS/JSON trả về
  const contentType = responseHeaders.get("content-type") || "";
  if (
    contentType.includes("text/html") ||
    contentType.includes("javascript") ||
    contentType.includes("application/json") ||
    contentType.includes("text/plain")
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

  // 8. Trả về assets nhị phân (ảnh, fonts, icon)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};

export const config = {
  path: "/*",
};
