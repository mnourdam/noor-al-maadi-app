import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/investigations/worlds')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/admin/investigations/worlds"!</div>
}
