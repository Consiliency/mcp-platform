" MCP autoload functions

let s:services_cache = []
let s:diagnostics = {}

" Initialize MCP
function! mcp#Init() abort
  " Initialize connection to MCP language server
  if executable('node')
    let s:lsp_cmd = ['node', expand('<sfile>:p:h:h') . '/../core/language-server.js']
  else
    echohl WarningMsg
    echo 'MCP: Node.js not found. Some features will be limited.'
    echohl None
  endif
endfunction

" Show services in a new buffer
function! mcp#ShowServices() abort
  let services = mcp#GetServices()
  
  " Create a new buffer
  new
  setlocal buftype=nofile
  setlocal bufhidden=wipe
  setlocal noswapfile
  setlocal nowrap
  setlocal nomodifiable
  
  " Set buffer name
  silent! file MCP\ Services
  
  " Add content
  call setline(1, '# MCP Services')
  call setline(2, '')
  
  let line = 3
  for service in services
    call setline(line, printf('## %s (%s)', service.name, service.id))
    call setline(line + 1, '')
    call setline(line + 2, service.description)
    call setline(line + 3, printf('Version: %s', service.version))
    call setline(line + 4, printf('Status: %s', service.status))
    call setline(line + 5, '')
    let line += 6
  endfor
  
  " Set filetype for syntax highlighting
  setlocal filetype=markdown
  setlocal nomodifiable
  
  " Key mappings for this buffer
  nnoremap <buffer> <silent> q :close<CR>
  nnoremap <buffer> <silent> <CR> :call mcp#ServiceAction()<CR>
endfunction

" Get list of services
function! mcp#GetServices() abort
  " In real implementation, this would call the SDK
  " For now, return mock data
  return [
    \ {'id': 'postgres-mcp', 'name': 'PostgreSQL MCP', 'description': 'PostgreSQL database service', 'version': '14.5', 'status': 'available'},
    \ {'id': 'mysql-mcp', 'name': 'MySQL MCP', 'description': 'MySQL database service', 'version': '8.0', 'status': 'available'},
    \ {'id': 'redis-mcp', 'name': 'Redis MCP', 'description': 'Redis cache service', 'version': '7.0', 'status': 'installed'}
    \ ]
endfunction

" Install a service
function! mcp#InstallService(service_id) abort
  echo 'Installing ' . a:service_id . '...'
  " In real implementation, this would call the SDK
  sleep 1
  echo 'Service ' . a:service_id . ' installed successfully!'
endfunction

" Prompt for service installation
function! mcp#InstallServicePrompt() abort
  let service_id = input('Service ID to install: ')
  if !empty(service_id)
    call mcp#InstallService(service_id)
  endif
endfunction

" Show service details
function! mcp#ShowServiceDetails(service_id) abort
  " Get service details
  let service = mcp#GetServiceDetails(a:service_id)
  
  if empty(service)
    echohl ErrorMsg
    echo 'Service not found: ' . a:service_id
    echohl None
    return
  endif
  
  " Create a new buffer
  new
  setlocal buftype=nofile
  setlocal bufhidden=wipe
  setlocal noswapfile
  setlocal nowrap
  
  " Set buffer name
  execute 'silent! file MCP\ Service:\ ' . a:service_id
  
  " Add content
  call setline(1, '# ' . service.name)
  call setline(2, '')
  call setline(3, service.description)
  call setline(4, '')
  call setline(5, '## Details')
  call setline(6, 'Version: ' . service.version)
  call setline(7, 'Status: ' . service.status)
  call setline(8, '')
  
  if has_key(service, 'config')
    call setline(9, '## Configuration Options')
    let line = 10
    for [key, value] in items(service.config)
      call setline(line, '- `' . key . '`: ' . value.description)
      let line += 1
    endfor
  endif
  
  setlocal filetype=markdown
  setlocal nomodifiable
  
  " Key mappings
  nnoremap <buffer> <silent> q :close<CR>
endfunction

" Get service details
function! mcp#GetServiceDetails(service_id) abort
  " Mock implementation
  let services = {
    \ 'postgres-mcp': {
    \   'id': 'postgres-mcp',
    \   'name': 'PostgreSQL MCP',
    \   'description': 'PostgreSQL database service for MCP',
    \   'version': '14.5',
    \   'status': 'available',
    \   'config': {
    \     'host': {'description': 'Database host'},
    \     'port': {'description': 'Database port'},
    \     'database': {'description': 'Database name'}
    \   }
    \ }
  \ }
  
  return get(services, a:service_id, {})
endfunction

" Refresh services cache
function! mcp#RefreshServices() abort
  let s:services_cache = []
  echo 'Services refreshed!'
endfunction

" Show health status
function! mcp#ShowHealth() abort
  let services = mcp#GetServices()
  
  echo 'MCP Service Health:'
  echo repeat('-', 40)
  
  for service in services
    let health = mcp#GetServiceHealth(service.id)
    echo printf('%-20s %s', service.id . ':', health.status)
  endfor
endfunction

" Get service health
function! mcp#GetServiceHealth(service_id) abort
  " Mock implementation
  return {'status': 'healthy', 'details': {}}
endfunction

" Enable completion
function! mcp#EnableCompletion() abort
  if has('nvim')
    " Neovim uses nvim-cmp source defined in plugin file
    return
  endif
  
  " Vim completion
  setlocal omnifunc=mcp#Complete
endfunction

" Completion function
function! mcp#Complete(findstart, base) abort
  if a:findstart
    " Find start of completion
    let line = getline('.')
    let start = col('.') - 1
    
    while start > 0 && line[start - 1] =~# '\k'
      let start -= 1
    endwhile
    
    return start
  else
    " Return completion items
    let items = []
    let line = getline('.')
    let col = col('.')
    
    " Check context
    if line =~# 'mcp\.\s*$'
      " MCP methods
      let items = [
        \ {'word': 'connectService', 'menu': 'Connect to MCP service'},
        \ {'word': 'installService', 'menu': 'Install MCP service'},
        \ {'word': 'listServices', 'menu': 'List available services'},
        \ {'word': 'callService', 'menu': 'Call service method'}
        \ ]
    elseif line =~# '["'']\w*$'
      " Service names
      let services = mcp#GetServices()
      for service in services
        call add(items, {'word': service.id, 'menu': service.name})
      endfor
    endif
    
    return items
  endif
endfunction

" Get completion items for nvim-cmp
function! mcp#GetCompletionItems(line, col) abort
  let items = []
  
  if a:line =~# 'mcp\.\s*$'
    " MCP methods
    let items = [
      \ {'label': 'connectService', 'kind': 2, 'detail': 'Connect to MCP service'},
      \ {'label': 'installService', 'kind': 2, 'detail': 'Install MCP service'},
      \ {'label': 'listServices', 'kind': 2, 'detail': 'List available services'},
      \ {'label': 'callService', 'kind': 2, 'detail': 'Call service method'}
      \ ]
  elseif a:line =~# '["'']\w*$'
    " Service names
    let services = mcp#GetServices()
    for service in services
      call add(items, {'label': service.id, 'kind': 9, 'detail': service.name})
    endfor
  endif
  
  return items
endfunction

" Update diagnostics
function! mcp#UpdateDiagnostics() abort
  let bufnr = bufnr('%')
  let filename = expand('%:p')
  
  " Clear existing signs
  execute 'sign unplace * buffer=' . bufnr
  
  " Get diagnostics
  let diagnostics = mcp#GetDiagnostics(filename)
  
  " Place signs
  let sign_id = 1
  for diag in diagnostics
    let sign_name = 'MCP' . diag.severity
    execute 'sign place ' . sign_id . ' line=' . diag.line . ' name=' . sign_name . ' buffer=' . bufnr
    let sign_id += 1
  endfor
  
  " Store diagnostics for quickfix
  let s:diagnostics[bufnr] = diagnostics
endfunction

" Get diagnostics for file
function! mcp#GetDiagnostics(filename) abort
  " Mock implementation
  let diagnostics = []
  
  if a:filename =~# 'mcp\.config\.json$'
    " Check for common issues in config files
    let content = join(getline(1, '$'), "\n")
    
    try
      let config = json_decode(content)
      
      " Check for unknown services
      if has_key(config, 'services')
        for service_id in keys(config.services)
          if service_id !~# '-mcp$'
            call add(diagnostics, {
              \ 'line': 1,
              \ 'severity': 'Warning',
              \ 'message': 'Service ID should end with -mcp: ' . service_id
              \ })
          endif
        endfor
      endif
    catch
      call add(diagnostics, {
        \ 'line': 1,
        \ 'severity': 'Error',
        \ 'message': 'Invalid JSON: ' . v:exception
        \ })
    endtry
  endif
  
  return diagnostics
endfunction

" Initialize on load
call mcp#Init()