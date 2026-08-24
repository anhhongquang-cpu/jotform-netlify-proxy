export default async (request, context) => {
  const url = new URL(request.url);

  // 1. Phân loại Host đích: Nếu là submit thì trỏ về submit.jotform.me, bình thường trỏ về form.jotform.me
  let targetHost = "form.jotform.me";
  if (url.pathname.startsWith("/submit/")) {
    targetHost = "submit.jotform.me";
  }

  const targetUrl = new URL(`https://${targetHost}${url.pathname}${url.search}`);

  // 2. Clone và thiết lập lại Headers
  const modifiedHeaders = new Headers(request.headers);
  modifiedHeaders.set("Host", targetHost);
  modifiedHeaders.set("Referer", `https://${targetHost}/`);
  modifiedHeaders.set("Origin", `https://${targetHost}`);

  // Xóa header accept-encoding để server Jotform trả về plain text (không nén gzip), 
  // giúp Edge Function có thể đọc và thay thế chuỗi tên miền
  modifiedHeaders.delete("accept-encoding");

  // 3. Chuẩn bị options cho fetch (xử lý cả GET, POST submit form)
  const fetchOptions = {
    method: request.method,
    headers: modifiedHeaders,
    redirect: "manual", // Không tự động follow để xử lý header Location chuyển trang
  };

  // Nếu là POST/PUT (submit dữ liệu), chuyển tiếp body lên Jotform
  if (request.method !== "GET" && request.method !== "HEAD") {
    fetchOptions.body = await request.arrayBuffer();
  }

  // 4. Gửi request đến Jotform
  const response = await fetch(targetUrl.toString(), fetchOptions);

  // 5. Xử lý trường hợp Jotform trả về Redirect (301/302 sau khi submit thành công)
  const responseHeaders = new Headers(response.headers);
  const locationHeader = responseHeaders.get("location");
  if (locationHeader) {
    let fixedLocation = locationHeader;
    const jotformHosts = [
      "submit.jotform.com",
      "submit.jotform.me",
      "submit.jotformpro.com",
      "form.jotform.com",
      "form.jotform.me",
      "form.jotformpro.com"
    ];
    for (const host of jotformHosts) {
      fixedLocation = fixedLocation
        .replaceAll(`https://${host}`, `https://${url.host}`)
        .replaceAll(host, url.host);
    }
    responseHeaders.set("location", fixedLocation);
  }

  // 6. Xử lý thay thế nội dung HTML / JS / JSON
  const contentType = responseHeaders.get("content-type") || "";
  if (
    contentType.includes("text/html") ||
    contentType.includes("javascript") ||
    contentType.includes("application/json")
  ) {
    let bodyText = await response.text();

    // Thay thế toàn bộ domain Jotform (gồm cả domain form và domain submit) thành domain Netlify
    const hostsToReplace = [
      "submit.jotform.com",
      "submit.jotform.me",
      "submit.jotformpro.com",
      "form.jotform.com",
      "form.jotform.me",
      "form.jotformpro.com"
    ];

    for (const host of hostsToReplace) {
      bodyText = bodyText.replaceAll(`https://${host}`, `https://${url.host}`);
      bodyText = bodyText.replaceAll(`//${host}`, `//${url.host}`);
      bodyText = bodyText.replaceAll(host, url.host);
    }

    // Xóa header content-length cũ do độ dài chuỗi đã thay đổi sau khi replace
    responseHeaders.delete("content-length");

    return new Response(bodyText, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }

  // 7. Với các asset nhị phân (hình ảnh, fonts, icons), trả về trực tiếp
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};

export const config = {
  path: "/*",
};
