import auth from "lib/auth";

export default async function getToken(req, res) {
  try {
    const { accessToken } = await auth(req).getAccessToken(req, res);
    if (accessToken) res.send(accessToken);
    res.status(204).end();
  } catch (error) {
    res.status(200).end();
    //res.status(error.status || 500).end(error.message);
  }
  res.end();
}
