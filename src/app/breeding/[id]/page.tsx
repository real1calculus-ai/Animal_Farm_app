export default async function Page({ params }: PageProps<"/breeding/[id]">) {
  const { id } = await params;
  return <div>{id}</div>;
}
