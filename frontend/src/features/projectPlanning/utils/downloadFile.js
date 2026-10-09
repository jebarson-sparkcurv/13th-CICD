import api from "../../../api/client";

export const downloadFile = async (url, fallbackName) => {
  const r = await api.get(url, { responseType: "blob" });
  const cd = r.headers["content-disposition"] || "";
  const match = cd.match(/filename="?([^";]+)"?/);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(r.data);
  a.download = match ? match[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
};
