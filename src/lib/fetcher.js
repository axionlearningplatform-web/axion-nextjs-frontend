const fetcher = (...args) => fetch(...args).then(res => {
    if (!res.ok) {
        const error = new Error("An error occurred")
        error.status = res.status
        throw error
    }
    return res.json()
})

export default fetcher