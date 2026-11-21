import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArticle, metric, fetchRank, fetchKeyword, categories } from '../discovery/provider.mjs';

test('RedFox keeps lower bounds, stable identity and source text', () => {
  assert.deepEqual(metric('10w+'), { value: 100000, exact: false, raw: '10w+' });
  assert.deepEqual(metric(null), { value: null, exact: false, raw: null });
  const article = normalizeArticle({ photoId: 'one', title: 'AI &amp; tools', oriUrl: 'https://mp.weixin.qq.com/s?__biz=x&mid=1&idx=1', clicksCount: '1w+', fans: null, content: '<p>原文</p>', publicTime: '2026-11-12 12:30:00' }, '科技数码');
  assert.equal(article.title, 'AI & tools');
  assert.equal(article.readCount, 10000);
  assert.equal(article.readExact, false);
  assert.equal(article.fans, undefined);
  assert.equal(article.publishedAt, '2026-11-12T04:30:00.000Z');
  assert.equal(article.content, '<p>原文</p>');
  assert.throws(() => normalizeArticle({ photoId: 'x', title: 'x', oriUrl: 'javascript:alert(1)' }, '科技数码'));
  assert.ok(categories.includes('总排名'));
});

test('keyword collection uses separate bounded first-page requests for the two RedFox catalogs',async()=>{
  const config={REDFOX_API_KEY:'fixture-only'};
  for(const [source,path] of [['keywordPremium','gzhData'],['keywordWide','gzh/data']]){
    let calls=0;
    const result=await fetchKeyword({source,keyword:' AI 工具 ',exactMatch:true},config,async(url,init)=>{
      calls++;
      assert.equal(url,`https://redfox.hk/story/api/${path}/searchArticle`);
      assert.equal(init.redirect,'error');
      assert.deepEqual(JSON.parse(init.body),{keyword:'AI 工具',offset:0,exactMatch:true});
      return Response.json({code:2000,data:{records:[]}});
    });
    assert.deepEqual(result,[]);
    assert.equal(calls,1);
  }
  await assert.rejects(fetchKeyword({source:'keywordWide',keyword:' '},config,()=>assert.fail('Invalid input must not make a request')),/关键词/);
});

test('provider uses header auth, bounds request and never silently retries', async () => {
  let count = 0;
  const fake = async (url, init) => {
    count++;
    assert.equal(url, 'https://redfox.hk/story/api/cozeSkill/getOriginalRank');
    assert.equal(init.headers.REDFOX_API_KEY, 'test-secret');
    assert.deepEqual(JSON.parse(init.body), { type: '科技数码', startDate: '2026-11-12', endDate: '2026-11-12' });
    return new Response(JSON.stringify({ code: 2000, data: [] }));
  };
  await fetchRank({ source: 'original', category: '科技数码', startDate: '2026-11-12', endDate: '2026-11-12' }, { REDFOX_API_KEY: 'test-secret' }, fake);
  assert.equal(count, 1);
  await assert.rejects(fetchRank({}, {}, fake), /未配置/);
  assert.equal(count, 1);
  await assert.rejects(fetchRank({source:'tenw',category:'科技数码',startDate:'2026-01-01',endDate:'2026-11-12'}, {REDFOX_API_KEY:'test-secret'}, fake), /60/);
});
