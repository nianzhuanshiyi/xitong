export default function LoginTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="animate-page-enter">{children}</div>;
}
