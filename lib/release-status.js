function classifyRelease(metadata, version) {
    const published = metadata?.versions?.[version];
    if (!published) return { state: 'not-visible', version, latest: metadata?.['dist-tags']?.latest || null, message: '미게시 또는 게시 후 처리 대기입니다. 성공 접수 여부는 게시 출력과 대조하고, 재게시 전에 다시 조회하세요.' };
    const latest = metadata['dist-tags']?.latest || null;
    return { state: latest === version ? 'available-latest' : 'available', version, latest, gitHead: published.gitHead || null, integrity: published.dist?.integrity || null, publishedAt: metadata.time?.[version] || null };
}
async function releaseStatus(packageInfo, request) {
    const metadata = await request(`https://registry.npmjs.org/${encodeURIComponent(packageInfo.name)}`, 'json');
    return classifyRelease(metadata, packageInfo.version);
}
module.exports = { classifyRelease, releaseStatus };
