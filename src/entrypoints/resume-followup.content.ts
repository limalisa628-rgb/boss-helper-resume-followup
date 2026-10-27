import { defineContentScript } from '#imports'
export default defineContentScript({
  matches: ['https://www.zhipin.com/web/geek/*'],
  runAt: 'document_idle',
  main() {
    if (document.getElementById('resume-followup-toggle')) return
    const button = document.createElement('button')
    button.id = 'resume-followup-toggle'
    button.textContent = '简历跟进'
    button.style.cssText =
      'position:fixed;right:18px;bottom:150px;z-index:2147483646;border:0;border-radius:12px;padding:12px 16px;background:#087e68;color:white;cursor:pointer;font:14px system-ui'
    let frame: HTMLIFrameElement | undefined
    button.addEventListener('click', () => {
      if (!frame) {
        frame = document.createElement('iframe')
        frame.src = chrome.runtime.getURL('followup.html')
        frame.title = '简历跟进工作台'
        frame.style.cssText =
          'position:fixed;right:18px;bottom:204px;width:min(600px,calc(100vw - 36px));height:min(780px,calc(100vh - 230px));z-index:2147483645;border:1px solid #bdd2c5;border-radius:12px;background:white;box-shadow:0 8px 40px #1234'
        document.body.append(frame)
      } else frame.hidden = !frame.hidden
      button.textContent = frame.hidden ? '简历跟进' : '关闭跟进面板'
    })
    document.body.append(button)
  },
})
