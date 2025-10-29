const express = require(express)
const app = express()
app.get(/health, (_, res) => res.json({ status: ok }))
app.get(/render, (_, res) => res.json({ url: null }))
app.listen(8400, () => console.log(Renderer
